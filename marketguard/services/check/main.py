from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="SEBI-Shield Check Bridge")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class UPIReq(BaseModel):
    upi: str

@app.post("/api/check/v1/upi-verify")
def upi_verify(req: UPIReq):
    # Demo logic: mark as verified if handle ends with '@valid' (for demo only)
    upi = (req.upi or "").strip()
    verified = upi.lower().endswith("@valid")
    display = "Verified handle • Demo Bank" if verified else "Not verified"
    return {"upi": upi, "verified": verified, "display": display}