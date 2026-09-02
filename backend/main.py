from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from backend.utils.seed_utils import seed_admin
from backend.config import settings
from backend.database import db
from backend.routers import auth, templates, surveys, tokens, public, webhook, analytics, users, attribute_banks, taste_test_configs, questions, purchase_funnels, question_modules, exports, responses, voice_feedback, voice_dashboard, sessions, brand_attributes, product_test_configs, product_test_questions, packaging_heatmap, product_test_media
from backend.utils.logging_utils import setup_logging, LoggingMiddleware

from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from backend.utils.rate_limit import limiter, rate_limit_exceeded_handler

@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()

    # Startup must not depend on the database being reachable. A transient DNS
    # or Atlas outage used to raise out of here, abort the lifespan and exit the
    # container — which then stayed down after the network recovered, taking the
    # login page with it. Now the API starts regardless and reconnects on demand.
    import logging as _logging
    _startup_log = _logging.getLogger("uvicorn")

    if db.connect():
        try:
            await db.ensure_indexes()
        except Exception as exc:
            _startup_log.warning("Index creation skipped — database unreachable: %s", exc)

        try:
            await seed_admin()
        except Exception as exc:
            _startup_log.warning("Admin seeding skipped — database unreachable: %s", exc)
    else:
        _startup_log.error(
            "Starting WITHOUT a database connection (%s). Requests needing data "
            "will fail until it recovers; /health reports live status.",
            db.last_error,
        )
    
    # Task 4.4: Prefix Warmup logic
    try:
        from backend.analytics_module.config_loader import load_app_config
        from backend.analytics_module.src.ai.warmup import start_warmup_background
        
        # Load global AI config
        app_config = load_app_config()
        if app_config.openai_api_key:
            # We also warm up a few key templates for multi-layer priming
            high_traffic_templates = ["slide_insights", "verbatim_brand"]
            await start_warmup_background(
                client=app_config.client, 
                model=app_config.model,
                templates=high_traffic_templates
            )
    except Exception as e:
        import logging
        logging.getLogger("uvicorn").warning(f"Failed to initiate AI Warmup: {e}")

    try:
        import os
        from backend.utils.pptx_rollout_flags import is_pptx_queue_enabled

        if is_pptx_queue_enabled():
            from backend.workers.pptx_reconciliation import reconcile_orphaned_pptx_jobs
            from backend.workers.pptx_queue import PptxJobQueue, SyncPptxJobQueue

            sync_q = SyncPptxJobQueue()
            async_q = PptxJobQueue()
            if sync_q.connect():
                stats = await reconcile_orphaned_pptx_jobs(db, sync_queue=sync_q, async_queue=async_q)
                import logging
                logging.getLogger("uvicorn").info(f"PPTX startup reconciliation: {stats}")
            await async_q.close()
    except Exception as e:
        import logging
        logging.getLogger("uvicorn").warning(f"PPTX reconciliation skipped: {e}")

    try:
        from backend.services.product_test_media_lifecycle import cleanup_abandoned_trial_media

        if settings.PRODUCT_TEST_MEDIA_STARTUP_CLEANUP:
            stats = await cleanup_abandoned_trial_media(dry_run=False, limit=200)
            import logging
            logging.getLogger("uvicorn").info(f"Trial media startup cleanup: {stats}")
    except Exception as e:
        import logging
        logging.getLogger("uvicorn").warning(f"Trial media startup cleanup skipped: {e}")

    try:
        yield
    finally:
        db.close()

app = FastAPI(title="Survey Platform API", lifespan=lifespan)

# Rate limiting (Redis-backed, proxy-aware keys — see backend/utils/rate_limit.py)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Logging Middleware
app.add_middleware(LoggingMiddleware)

# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    csp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' *"
    if os.getenv("ENV") == "production":
        csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
    
    response.headers["Content-Security-Policy"] = csp
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

import os

# CORS Configuration
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:8000",
]

if allowed_origins_env == "*":
    origins = ["*"]
elif allowed_origins_env:
    origins.extend([o.strip() for o in allowed_origins_env.split(",")])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Browsers hide every response header from JS unless it is explicitly
    # exposed. Without Content-Disposition the download helper cannot read the
    # server-supplied filename and has to invent one.
    expose_headers=["Content-Disposition", "X-PPTX-Export-Manifest-Summary"],
)

app.include_router(auth.router)
app.include_router(templates.router)
app.include_router(surveys.router)
app.include_router(tokens.router)
app.include_router(public.router)
app.include_router(webhook.router)
app.include_router(analytics.router)
app.include_router(users.router)
app.include_router(attribute_banks.router)
app.include_router(taste_test_configs.router)
app.include_router(questions.router)
app.include_router(purchase_funnels.router)
app.include_router(question_modules.router)
app.include_router(exports.router)
app.include_router(responses.router)
app.include_router(voice_feedback.router)
app.include_router(voice_dashboard.router)
app.include_router(sessions.router)
app.include_router(brand_attributes.router)
app.include_router(product_test_configs.router)
app.include_router(product_test_questions.router)
app.include_router(packaging_heatmap.router)
app.include_router(product_test_media.router)

@app.get("/")
async def root():
    return {"message": "Survey Platform API is running"}


@app.get("/health")
async def health():
    """
    Liveness plus real database reachability.

    The API now starts even when the database is down, so "the process is up"
    is no longer enough to know it can serve. This pings the server, which also
    triggers a reconnect if an earlier attempt failed.
    """
    database_ok = await db.ping()
    return {
        "status": "ok" if database_ok else "degraded",
        "database": "connected" if database_ok else "unavailable",
        "detail": None if database_ok else db.last_error,
    }
