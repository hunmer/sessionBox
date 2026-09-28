import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from qianwen_client import QianwenClient, QIANWEN_MODELS

client = None
class ChatRequest(BaseModel):
    messages: list
    model: str = "qianwen"
    stream: bool = False

@asynccontextmanager
async def lifespan(app):
    global client
    client = QianwenClient(headless=True, page_id=os.environ.get("QIANWEN_PAGE_ID"), sessionbox_url=os.environ.get("SESSIONBOX_API_URL", "http://127.0.0.1:19100"), sessionbox_token=os.environ.get("SESSIONBOX_API_TOKEN", ""))
    await client.start()
    yield
    await client.stop()

app = FastAPI(title="Qianwen API", lifespan=lifespan)
@app.get("/health")
async def health(): return {"ready": bool(client and client.is_ready)}
@app.get("/v1/models")
async def models(): return {"object": "list", "data": [{"id": k, "object": "model", "owned_by": "qianwen"} for k in QIANWEN_MODELS]}
@app.post("/v1/chat/completions")
async def chat(body: ChatRequest):
    if not client or not client.is_ready: raise HTTPException(503, "Qianwen client not ready")
    config = QIANWEN_MODELS.get(body.model, {"model": body.model, "deep_search": "0"})
    if body.stream:
        async def stream():
            async for item in client.chat_stream(body.messages, config["model"], config.get("deep_search", "0")):
                yield f"data: {item}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream(), media_type="text/event-stream")
    result = await client.chat(body.messages, config["model"], config.get("deep_search", "0"))
    return {"id": "qianwen", "object": "chat.completion", "choices": [{"index": 0, "message": {"role": "assistant", "content": result.get("content", "")}, "finish_reason": "stop"}]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.environ.get("QIANWEN_HOST", "127.0.0.1"), port=int(os.environ.get("QIANWEN_PORT", "9091")))
