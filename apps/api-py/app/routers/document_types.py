from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import record_audit_log
from ..db import get_db
from ..deps import AuthenticatedUser, require_permission
from ..errors import ApiError
from ..models import AIJobType, RequiredDocumentType
from ..response import envelope
from ..schemas import CreateRequiredDocumentTypeRequest
from ..serializers import serialize_required_document_type

router = APIRouter(prefix="/v1/document-types", tags=["document-types"])

ENTITY_TYPE = "RequiredDocumentType"


@router.post("")
def create(
    dto: CreateRequiredDocumentTypeRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("document-type:manage")),
):
    doc_type = RequiredDocumentType(
        code=dto.code, name=dto.name, aiJobType=AIJobType(dto.aiJobType) if dto.aiJobType else None
    )
    db.add(doc_type)
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=doc_type.id,
        action="CREATE",
        actor_user_id=user.user_id,
        after_state=serialize_required_document_type(doc_type),
    )
    db.commit()
    db.refresh(doc_type)
    return envelope(serialize_required_document_type(doc_type))


@router.get("")
def find_many(
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission("document-type:read")),
):
    rows = list(db.scalars(select(RequiredDocumentType).order_by(RequiredDocumentType.createdAt.asc())))
    return envelope([serialize_required_document_type(r) for r in rows])


@router.patch("/{doc_type_id}/deactivate")
def deactivate(
    doc_type_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permission("document-type:manage")),
):
    doc_type = db.get(RequiredDocumentType, doc_type_id)
    if doc_type is None:
        raise ApiError(404, "Không tìm thấy loại chứng từ")

    before_is_active = doc_type.isActive
    doc_type.isActive = False
    db.flush()
    record_audit_log(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=doc_type_id,
        action="DEACTIVATE",
        actor_user_id=user.user_id,
        before_state={"isActive": before_is_active},
        after_state={"isActive": doc_type.isActive},
    )
    db.commit()
    db.refresh(doc_type)
    return envelope(serialize_required_document_type(doc_type))
