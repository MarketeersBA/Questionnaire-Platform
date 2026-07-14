from datetime import timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from backend.config import settings
from backend.database import db
from backend.models import User, UserCreate, UserInDB
from backend.routers.capture_auth_deps import (
    get_current_user,
    get_current_user_or_capture_user,
    oauth2_scheme,
)
from backend.utils.security import (
    create_access_token,
    get_password_hash,
    verify_password,
)
from backend.utils.logging_utils import logger
from backend.utils.audit_utils import log_action

router = APIRouter(prefix="/auth", tags=["auth"])

# Re-exported for routers that import from auth (capture deps live in capture_auth_deps.py).
__all__ = [
    "get_current_user",
    "get_current_user_or_capture_user",
    "oauth2_scheme",
]


async def _get_user(username: str) -> Optional[UserInDB]:
    users_col = db.get_collection("users")
    raw = await users_col.find_one({"username": username})
    if not raw:
        return None
    return UserInDB(**raw)


async def _create_user(user_in: UserCreate) -> User:
    users_col = db.get_collection("users")

    existing = await users_col.find_one({"username": user_in.username})
    if existing:
        logger.warning(f"Signup failed: Username {user_in.username} already registered")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered",
        )

    hashed_pw = get_password_hash(user_in.password)
    doc = {
        "username": user_in.username,
        "email": user_in.email,
        "is_active": user_in.is_active,
        "role": user_in.role,
        "hashed_password": hashed_pw,
        "created_at": UserInDB.model_fields["created_at"].default_factory(),
    }
    result = await users_col.insert_one(doc)
    created = await users_col.find_one({"_id": result.inserted_id})
    logger.info(f"User created successfully: {user_in.username}")
    
    # We don't have a 'current_user' easily available in _create_user without passing it,
    # and _create_user is called by signup (anonymous) and seed (system).
    # For now, we'll log signup in the route.
    
    return User(**created)


async def get_current_active_admin(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required",
        )
    return current_user


async def get_current_active_analyst(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role not in ["admin", "analyst"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Analyst or Administrative privileges required",
        )
    return current_user


@router.post("/signup")
async def signup(user_in: UserCreate):
    """
    Register a new user and return an access token.
    """
    user = await _create_user(user_in)

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role}, expires_delta=access_token_expires
    )
    await log_action(
        user=user,
        action="signup",
        resource_type="auth",
        resource_id=str(user.id)
    )

    return {"access_token": access_token, "token_type": "bearer", "role": user.role}


@router.post("/token")
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()]
):
    """
    Authenticate a user with username & password and issue a JWT.
    If no user exists yet and credentials match ADMIN_* settings, seed the first admin.
    """
    user_in_db = await _get_user(form_data.username)

    # Initial admin check moved to startup lifespan (seed_admin)
    if not user_in_db:
        logger.warning(f"Login failure: User {form_data.username} not found")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user_in_db or not verify_password(
        form_data.password, user_in_db.hashed_password
    ):
        logger.warning(f"Login failure for user: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    logger.info(f"User logged in: {user_in_db.username}")

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user_in_db.username, "role": user_in_db.role}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "role": user_in_db.role}


@router.get("/me", response_model=User)
async def read_users_me(current_user: Annotated[User, Depends(get_current_user)]):
    return current_user


@router.post("/logout")
async def logout():
    """
    Stateless JWT logout: the client should forget the token.
    Provided for frontend symmetry.
    """
    return {"detail": "Logged out"}
