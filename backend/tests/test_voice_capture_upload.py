import pytest
from unittest.mock import AsyncMock, patch
from io import BytesIO


@pytest.mark.asyncio
async def test_save_voice_upload_skips_pipeline_when_ai_disabled():
    from backend.voice_feedback.upload_handler import save_voice_upload

    class FakeUpload:
        filename = "test.webm"

        async def read(self):
            return b"1234"

        async def seek(self, _):
            return None

        @property
        def file(self):
            return BytesIO(b"1234")

    with patch("backend.voice_feedback.upload_handler.db") as mock_db, patch(
        "backend.voice_feedback.upload_handler.process_voice_pipeline", new_callable=AsyncMock
    ) as mock_pipeline:
        bucket = AsyncMock()
        bucket.upload_from_stream = AsyncMock(return_value="grid123")
        mock_db.get_gridfs_bucket.return_value = bucket
        coll = AsyncMock()
        coll.insert_one = AsyncMock(return_value=type("R", (), {"inserted_id": "fb1"})())
        mock_db.get_collection.return_value = coll

        bg = AsyncMock()
        fid = await save_voice_upload(
            "s1", "q1", "tok", FakeUpload(), bg, metadata={"brand_name": "A"}, ai_analysis_enabled=False
        )
        assert fid == "fb1"
        mock_pipeline.assert_not_called()
        insert_doc = coll.insert_one.call_args[0][0]
        assert insert_doc["status"] == "stored"
        assert insert_doc["ai_analysis_enabled"] is False
        assert insert_doc["brand_name"] == "A"


@pytest.mark.asyncio
async def test_save_voice_upload_runs_pipeline_when_ai_enabled():
    from backend.voice_feedback.upload_handler import save_voice_upload

    class FakeUpload:
        filename = "test.webm"

        async def read(self):
            return b"1234"

        async def seek(self, _):
            return None

        @property
        def file(self):
            return BytesIO(b"1234")

    with patch("backend.voice_feedback.upload_handler.db") as mock_db, patch(
        "backend.voice_feedback.upload_handler.process_voice_pipeline", new_callable=AsyncMock
    ) as mock_pipeline:
        bucket = AsyncMock()
        bucket.upload_from_stream = AsyncMock(return_value="grid123")
        mock_db.get_gridfs_bucket.return_value = bucket
        coll = AsyncMock()
        coll.insert_one = AsyncMock(return_value=type("R", (), {"inserted_id": "fb2"})())
        mock_db.get_collection.return_value = coll

        bg = AsyncMock()
        fid = await save_voice_upload(
            "s1", "q1", "tok", FakeUpload(), bg, ai_analysis_enabled=True
        )
        assert fid == "fb2"
        bg.add_task.assert_called_once()
        assert bg.add_task.call_args[0][0] is mock_pipeline
