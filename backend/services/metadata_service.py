"""
Line metadata standardization service.

Converts all line metadata formats into a single internal format at ingestion time.
After standardization, all metadata follows the same structure.
"""

from typing import Any, Dict, List, Optional, Union
import logging

logger = logging.getLogger(__name__)

LineMeta = Union[List[Any], Dict[str, Any]]


class StandardizedMetadata:
    """
    Standardized line metadata format.
    All metadata is converted to this format at ingestion.
    """
    def __init__(self, page: int, x: float, y: float, width: float, height: float):
        self.page = page
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary format."""
        return {
            "page": self.page,
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
        }
    
    def to_coord_list(self) -> List[float]:
        """Convert to [x, y, width, height] format (no page)."""
        return [self.x, self.y, self.width, self.height]


class MetadataService:
    """
    Service for standardizing line metadata formats.
    """
    
    def standardize_metadata(
        self, 
        line_metadata: Union[List[LineMeta], Dict[str, LineMeta]]
    ) -> List[Optional[StandardizedMetadata]]:
        """
        Convert all line metadata to standardized format.
        
        Args:
            line_metadata: Raw metadata in various formats (list or dict)
            
        Returns:
            List of StandardizedMetadata objects (None for invalid entries)
        """
        standardized: List[Optional[StandardizedMetadata]] = []
        invalid_count = 0
        
        if isinstance(line_metadata, dict):
            # Convert dict to list by iterating through keys
            max_key = max((int(k) for k in line_metadata.keys() if str(k).isdigit()), default=-1)
            for i in range(max_key + 1):
                meta = line_metadata.get(str(i)) or line_metadata.get(i)
                std_meta = self._standardize_single(meta, line_index=i)
                standardized.append(std_meta)
                if std_meta is None:
                    invalid_count += 1
        elif isinstance(line_metadata, list):
            for i, meta in enumerate(line_metadata):
                std_meta = self._standardize_single(meta, line_index=i)
                standardized.append(std_meta)
                if std_meta is None:
                    invalid_count += 1
        else:
            logger.error(f"[MetadataService] Invalid line_metadata type: {type(line_metadata)}")
            return []
        
        if invalid_count > 0:
            logger.warning(f"[MetadataService] Standardized {len(standardized)} entries, {invalid_count} invalid")
        
        return standardized
    
    def _standardize_single(
        self, 
        meta: LineMeta, 
        line_index: int
    ) -> Optional[StandardizedMetadata]:
        """
        Standardize a single metadata entry.
        
        Returns None if metadata is invalid (no guessing).
        """
        if meta is None:
            logger.warning(f"[MetadataService] Missing metadata for line {line_index}")
            return None
        
        # Format 1: Dictionary with x, y, width, height, page
        if isinstance(meta, dict):
            page = meta.get("page") or meta.get("p")
            x = meta.get("x") or meta.get("left")
            y = meta.get("y") or meta.get("top")
            width = meta.get("width") or meta.get("w")
            height = meta.get("height") or meta.get("h")
            
            # Validate all required fields
            if page is None or x is None or y is None or width is None or height is None:
                logger.warning(
                    f"[MetadataService] Incomplete dict metadata for line {line_index}: "
                    f"page={page}, x={x}, y={y}, width={width}, height={height}"
                )
                return None
            
            # Validate types and values
            try:
                page = int(page)
                x = float(x)
                y = float(y)
                width = float(width)
                height = float(height)
                
                if width <= 0 or height <= 0:
                    logger.warning(
                        f"[MetadataService] Invalid dimensions for line {line_index}: "
                        f"width={width}, height={height}"
                    )
                    return None
                
                return StandardizedMetadata(page, x, y, width, height)
            except (ValueError, TypeError) as e:
                logger.warning(
                    f"[MetadataService] Type conversion error for line {line_index}: {e}"
                )
                return None
        
        # Format 2: List [page, x, y, width, height]
        if isinstance(meta, (list, tuple)):
            if len(meta) >= 5:
                try:
                    page = int(meta[0])
                    x = float(meta[1])
                    y = float(meta[2])
                    width = float(meta[3])
                    height = float(meta[4])
                    
                    if width <= 0 or height <= 0:
                        logger.warning(
                            f"[MetadataService] Invalid dimensions for line {line_index}: "
                            f"width={width}, height={height}"
                        )
                        return None
                    
                    return StandardizedMetadata(page, x, y, width, height)
                except (ValueError, TypeError, IndexError) as e:
                    logger.warning(
                        f"[MetadataService] List format error for line {line_index}: {e}"
                    )
                    return None
            
            # Format 3: List [page, base_y, height, page_height] (legacy format)
            # Convert to [x=0, y=top_y, width=page_height, height=height]
            if len(meta) >= 4:
                try:
                    page = int(meta[0])
                    base_y = float(meta[1])
                    height = float(meta[2])
                    page_height = float(meta[3])
                    
                    if height <= 0 or page_height <= 0:
                        logger.warning(
                            f"[MetadataService] Invalid dimensions for line {line_index}: "
                            f"height={height}, page_height={page_height}"
                        )
                        return None
                    
                    # Convert base_y to top_y
                    top_y = max(0, base_y - height)
                    # Use page_height as width proxy for full-width lines
                    x = 0
                    width = page_height
                    
                    return StandardizedMetadata(page, x, top_y, width, height)
                except (ValueError, TypeError, IndexError) as e:
                    logger.warning(
                        f"[MetadataService] Legacy list format error for line {line_index}: {e}"
                    )
                    return None
        
        logger.warning(
            f"[MetadataService] Unknown metadata format for line {line_index}: {type(meta)}"
        )
        return None
    
    def get_line_metadata(
        self,
        standardized_metadata: List[Optional[StandardizedMetadata]],
        line_index: int
    ) -> Optional[StandardizedMetadata]:
        """
        Get standardized metadata for a specific line index.
        
        No guessing, no off-by-one fallback - returns None if invalid.
        """
        if line_index < 0 or line_index >= len(standardized_metadata):
            return None
        
        return standardized_metadata[line_index]


metadata_service = MetadataService()

