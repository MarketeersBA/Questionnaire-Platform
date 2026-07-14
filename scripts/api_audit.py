import httpx
import asyncio
import time
import json
from datetime import datetime
import uuid

import os
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:8003")
ADMIN_USER = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASS = os.getenv("ADMIN_PASSWORD", "admin123")

results = []

def log_result(endpoint, method, status_code, duration, success, detail=""):
    results.append({
        "endpoint": endpoint,
        "method": method,
        "status_code": status_code,
        "duration": f"{duration:.2f}s",
        "success": success,
        "detail": detail
    })
    status_str = "PASS" if success else "FAIL"
    print(f"{status_str} | {method} {endpoint} | {status_code} | {duration:.2f}s")

async def test_endpoint(client, method, endpoint, **kwargs):
    start_time = time.perf_counter()
    try:
        response = await client.request(method, endpoint, **kwargs)
        duration = time.perf_counter() - start_time
        success = 200 <= response.status_code < 300
        detail = ""
        if not success:
            try:
                detail = response.json().get("detail", response.text)
            except:
                detail = response.text
        log_result(endpoint, method, response.status_code, duration, success, detail)
        return response
    except Exception as e:
        duration = time.perf_counter() - start_time
        log_result(endpoint, method, 0, duration, False, str(e))
        return None

async def run_audit():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        print(f"\nRE-STARTING API Audit at {BASE_URL}\n" + "="*50)

        # 1. Auth Flow
        print("\n--- Testing Auth Router ---")
        login_data = {"username": ADMIN_USER, "password": ADMIN_PASS}
        token_resp = await test_endpoint(client, "POST", "/auth/token", data=login_data)
        
        if not token_resp or token_resp.status_code != 200:
            print("❌ Authentication failed. Stopping audit.")
            return

        token = token_resp.json()["access_token"]
        auth_headers = {"Authorization": f"Bearer {token}"}
        
        await test_endpoint(client, "GET", "/auth/me", headers=auth_headers)
        await test_endpoint(client, "POST", "/auth/logout", headers=auth_headers)

        # 2. Templates Flow
        print("\n--- Testing Templates Router ---")
        template_payload = {
            "name": f"Audit Template {uuid.uuid4().hex[:6]}",
            "type": "taste_test",
            "layer1_questions": [{"id": "S1", "text": "Are you a coffee drinker?", "type": "mcq", "options": ["Yes", "No"]}],
            "layer1_structure": {"sections": [{"title": "Initial", "questions": []}]},
            "layer1_question_schema": {},
            "layer2_structure": {"sections": [{"title": "Taste", "questions": []}]}
        }
        create_tpl_resp = await test_endpoint(client, "POST", "/templates/", json=template_payload, headers=auth_headers)
        
        template_id = None
        if create_tpl_resp:
            template_id = create_tpl_resp.json().get("_id")
            await test_endpoint(client, "GET", "/templates/", headers=auth_headers)
            await test_endpoint(client, "GET", f"/templates/{template_id}", headers=auth_headers)
            await test_endpoint(client, "GET", f"/templates/history/{template_payload['name']}", headers=auth_headers)

        # 3. Surveys Flow
        print("\n--- Testing Surveys Router ---")
        survey_id = None
        if template_id:
            survey_payload = {
                "company_name": "Audit Corp",
                "template_id": template_id,
                "google_form_id": "1A2B3C4D5E6F",
                "google_form_url": "https://forms.google.com/test",
                "layer1_rules": {"age_min": 18, "gender": "Both"},
                "customizations": {"category": "Beverages", "brands": ["AuditCoffee"]}
            }
            create_survey_resp = await test_endpoint(client, "POST", "/surveys/", json=survey_payload, headers=auth_headers)
            if create_survey_resp:
                survey_id = create_survey_resp.json().get("_id")
                await test_endpoint(client, "GET", "/surveys/", headers=auth_headers)
                await test_endpoint(client, "GET", f"/surveys/{survey_id}", headers=auth_headers)

        # 4. Tokens Flow
        print("\n--- Testing Tokens Router ---")
        test_token_str = None
        if survey_id:
            token_gen_payload = {"survey_id": survey_id, "count": 5}
            gen_token_resp = await test_endpoint(client, "POST", "/tokens/generate", json=token_gen_payload, headers=auth_headers)
            if gen_token_resp:
                test_token_str = gen_token_resp.json()[0]
                await test_endpoint(client, "GET", f"/tokens/survey/{survey_id}/summary", headers=auth_headers)
                await test_endpoint(client, "GET", f"/tokens/survey/{survey_id}", headers=auth_headers)

        # 5. Public Flow
        print("\n--- Testing Public Router ---")
        if test_token_str:
            await test_endpoint(client, "GET", f"/s/{test_token_str}")
            l1_resp_payload = {
                "answers": {"age": 25, "gender": "Both"},
                "phone": "1234567890"
            }
            await test_endpoint(client, "POST", f"/s/{test_token_str}/layer1", json=l1_resp_payload)

        # 6. Analytics Flow
        print("\n--- Testing Analytics Router ---")
        if survey_id:
            await test_endpoint(client, "GET", f"/analytics/funnel/{survey_id}", headers=auth_headers)
            await test_endpoint(client, "GET", f"/analytics/trends/{survey_id}", headers=auth_headers)
            await test_endpoint(client, "GET", "/analytics/orphans", headers=auth_headers)

        # 7. Webhook Flow
        print("\n--- Testing Webhook Router ---")
        webhook_payload = {
            "token": test_token_str,
            "answers": {"Q1": "5", "Q2": "4"}
        }
        await test_endpoint(client, "POST", "/webhook/google-form", json=webhook_payload)

        # Cleanup (Soft delete template)
        if template_id:
            print("\n--- Cleanup ---")
            await test_endpoint(client, "DELETE", f"/templates/{template_id}", headers=auth_headers)

        # Save Final Report
        report = {
            "timestamp": datetime.now().isoformat(),
            "summary": {
                "total": len(results),
                "passed": len([r for r in results if r["success"]]),
                "failed": len([r for r in results if not r["success"]])
            },
            "results": results
        }
        with open("api_audit_results.json", "w") as f:
            json.dump(report, f, indent=4)
        
        print(f"\nAudit Complete. Saved to api_audit_results.json")
        print(f"Summary: {report['summary']['passed']}/{report['summary']['total']} tests passed.")

if __name__ == "__main__":
    asyncio.run(run_audit())
