from pydantic import BaseModel


class ParsedChunkData(BaseModel):
    """待入库的分块数据。"""

    chunk_id: str
    content: str
    metadata: dict
