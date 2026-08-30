import chromadb
from chromadb.config import Settings as ChromaSettings

from .config import CHROMA_DIR


class VectorStore:
    def __init__(self):
        CHROMA_DIR.mkdir(parents=True, exist_ok=True)
        self.client = chromadb.PersistentClient(
            path=str(CHROMA_DIR),
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self._cols: dict[str, chromadb.Collection] = {}

    def collection(self, key: str) -> chromadb.Collection:
        if key not in self._cols:
            self._cols[key] = self.client.get_or_create_collection(
                name=f"mnemos_{key}",
                metadata={"hnsw:space": "cosine"},
            )
        return self._cols[key]

    def upsert(self, key: str, ids, vectors, docs, metas):
        col = self.collection(key)
        existing = set(col.get(ids=ids)["ids"])
        if existing:
            col.delete(ids=list(existing))
        col.add(ids=ids, embeddings=vectors, documents=docs, metadatas=metas)

    def query(self, key: str, vector, k: int):
        col = self.collection(key)
        if col.count() == 0:
            return []
        res = col.query(
            query_embeddings=[vector],
            n_results=col.count(),
            include=["documents", "metadatas", "distances"],
        )
        hits = []
        docs = res["documents"][0]
        metas = res["metadatas"][0]
        dists = res["distances"][0]
        ids = res["ids"][0]
        for i in range(len(docs)):
            if metas[i].get("excluded"):
                continue
            hits.append({
                "id": ids[i],
                "text": docs[i],
                "meta": metas[i],
                "score": round(1.0 - float(dists[i]), 4),
            })
        hits.sort(key=lambda h: h["score"], reverse=True)
        return hits[:k]

    def delete_file(self, path: str):
        for col in self._all_cols():
            try:
                col.delete(where={"path": path})
            except Exception:
                pass

    def get_file_meta(self, key: str, path: str) -> dict | None:
        col = self.collection(key)
        if col.count() == 0:
            return None
        res = col.get(where={"path": path}, include=["metadatas"], limit=1)
        metas = res.get("metadatas") or []
        return metas[0] if metas else None

    def all_metas(self, key: str):
        col = self.collection(key)
        if col.count() == 0:
            return [], []
        res = col.get(include=["metadatas"])
        return res["ids"], res["metadatas"]

    def _all_cols(self) -> list:
        try:
            return list(self.client.list_collections())
        except Exception:
            return []

    def clear_all(self):
        for col in self._all_cols():
            try:
                self.client.delete_collection(col.name)
            except Exception:
                pass
        self._cols.clear()

    def counts(self) -> dict:
        out = {}
        for col in self._all_cols():
            try:
                out[col.name] = col.count()
            except Exception:
                out[col.name] = 0
        return out


store = VectorStore()
