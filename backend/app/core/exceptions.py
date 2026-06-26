class AppException(Exception):
    status_code: int = 500
    detail: str = "Internal server error"
    error_code: str = "internal_error"
    request_id: str | None = None

    def __init__(self, detail: str | None = None, error_code: str | None = None, request_id: str | None = None):
        if detail:
            self.detail = detail
        if error_code:
            self.error_code = error_code
        if request_id:
            self.request_id = request_id
