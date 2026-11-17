import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import router

# Log lines carry codes and tool names only: never prompts, records, arguments or results.
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")

app = FastAPI(
    title="MichaelOS Intelligence",
    version="0.1.0",
    description="Michael's AI engine. Called only by the MichaelOS Next.js server.",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.include_router(router)

MAX_BODY_BYTES = 4 * 1024 * 1024


class RequestBodyLimitMiddleware:
    """Bounds request bodies, chunked ones included (same as the planner's)."""

    def __init__(self, application, max_bytes: int = MAX_BODY_BYTES):
        self.application = application
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.application(scope, receive, send)
            return
        declared = next((value for name, value in scope.get("headers", []) if name.lower() == b"content-length"), None)
        if declared is not None:
            try:
                if int(declared) > self.max_bytes:
                    await self._too_large(scope, receive, send)
                    return
            except ValueError:
                await JSONResponse(status_code=400, content={"error": "INVALID_CONTENT_LENGTH", "message": "The request content length is invalid."})(scope, receive, send)
                return
        messages, total = [], 0
        while True:
            message = await receive()
            messages.append(message)
            if message["type"] == "http.disconnect":
                break
            if message["type"] != "http.request":
                continue
            total += len(message.get("body", b""))
            if total > self.max_bytes:
                await self._too_large(scope, receive, send)
                return
            if not message.get("more_body", False):
                break
        replayed = 0

        async def replay():
            nonlocal replayed
            if replayed < len(messages):
                replayed += 1
                return messages[replayed - 1]
            return await receive()

        await self.application(scope, replay, send)

    async def _too_large(self, scope, receive, send):
        await JSONResponse(status_code=413, content={"error": "REQUEST_TOO_LARGE", "message": "The request body is too large."})(scope, receive, send)


app.add_middleware(RequestBodyLimitMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, error: RequestValidationError):
    # Field locations only: input values may be user content and are never echoed.
    fields = sorted({".".join(str(part) for part in issue.get("loc", [])[1:]) for issue in error.errors()})
    return JSONResponse(status_code=422, content={"error": "INVALID_REQUEST", "message": "The request does not match the step contract.", "fields": fields[:20]})


@app.exception_handler(StarletteHTTPException)
async def http_error(_: Request, error: StarletteHTTPException):
    detail = error.detail if isinstance(error.detail, dict) else {"error": "HTTP_ERROR", "message": str(error.detail)}
    return JSONResponse(status_code=error.status_code, content=detail, headers=getattr(error, "headers", None))
