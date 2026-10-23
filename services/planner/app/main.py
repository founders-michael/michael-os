from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import router

app = FastAPI(
    title="MichaelOS Planner",
    version="0.1.0",
    description="Deterministic, stateless schedule proposals for MichaelOS.",
    docs_url=None,
    redoc_url=None,
)
app.include_router(router)


class RequestBodyLimitMiddleware:
    """Bound request bodies even when clients use chunked transfer encoding."""

    def __init__(self, application, max_bytes: int = 1_048_576):
        self.application = application
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.application(scope, receive, send)
            return

        content_length = next((value for name, value in scope.get("headers", []) if name.lower() == b"content-length"), None)
        if content_length is not None:
            try:
                if int(content_length) > self.max_bytes:
                    await self._too_large(scope, receive, send)
                    return
            except ValueError:
                response = JSONResponse(status_code=400, content={"error": "INVALID_CONTENT_LENGTH", "message": "The request content length is invalid."})
                await response(scope, receive, send)
                return

        messages = []
        total_bytes = 0
        while True:
            message = await receive()
            messages.append(message)
            if message["type"] == "http.disconnect":
                break
            if message["type"] != "http.request":
                continue
            total_bytes += len(message.get("body", b""))
            if total_bytes > self.max_bytes:
                await self._too_large(scope, receive, send)
                return
            if not message.get("more_body", False):
                break

        next_message = 0

        async def replay_receive():
            nonlocal next_message
            if next_message < len(messages):
                message = messages[next_message]
                next_message += 1
                return message
            return {"type": "http.request", "body": b"", "more_body": False}

        await self.application(scope, replay_receive, send)

    async def _too_large(self, scope, receive, send):
        response = JSONResponse(status_code=413, content={"error": "REQUEST_TOO_LARGE", "message": "Planning requests may not exceed 1 MiB."})
        await response(scope, receive, send)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exception: RequestValidationError):
    issues = [{"location": error["loc"], "message": error["msg"], "type": error["type"]} for error in exception.errors()]
    return JSONResponse(status_code=422, content={"error": "INVALID_REQUEST", "message": "The planning request did not match the required contract.", "issues": issues})


@app.exception_handler(StarletteHTTPException)
async def http_error(_request: Request, exception: StarletteHTTPException):
    detail = exception.detail
    if isinstance(detail, dict) and isinstance(detail.get("error"), str) and isinstance(detail.get("message"), str):
        content = {"error": detail["error"], "message": detail["message"]}
    else:
        content = {"error": "REQUEST_FAILED", "message": "The request could not be completed."}
    return JSONResponse(status_code=exception.status_code, content=content, headers=exception.headers)


@app.exception_handler(Exception)
async def internal_error(_request: Request, _exception: Exception):
    return JSONResponse(status_code=500, content={"error": "INTERNAL_ERROR", "message": "The planning service encountered an internal error."})


app.add_middleware(RequestBodyLimitMiddleware)
