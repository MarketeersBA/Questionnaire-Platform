"""Segmentation model: parses segment names and elements from CSV-like text."""

from typing import Dict, List


class Segment:
    NO_SEGMENTATION = "No Segmentation"

    def __init__(self, name: str, element_count: int, string_segments: str = "", string_elements: str = ""):
        self._name = name
        self._element_count = element_count
        self._segment: Dict[str, "Segment"] = {}
        self._member: Dict[str, str] = {}
        self._elements: List[str] = []
        self._member_count = 0
        if string_segments and string_elements:
            self.fill_segments(string_segments, string_elements)

    @property
    def name(self) -> str:
        return self._name

    @name.setter
    def name(self, value: str) -> None:
        self._name = value

    @property
    def member(self) -> Dict[str, str]:
        return self._member

    @member.setter
    def member(self, value: Dict[str, str]) -> None:
        self._member = value

    @property
    def elements(self) -> List[str]:
        return self._elements

    @elements.setter
    def elements(self, value: List[str]) -> None:
        self._elements = value

    @property
    def member_count(self) -> int:
        return self._member_count

    @member_count.setter
    def member_count(self, value: int) -> None:
        self._member_count = value

    @property
    def element_count(self) -> int:
        return self._element_count

    @element_count.setter
    def element_count(self, value: int) -> None:
        self._element_count = value

    def get_segmentation_type_with_member_name_array(self) -> List[str]:
        result: List[str] = []
        for seg_name, seg in self._segment.items():
            result.append(seg_name)
            for _, member_val in seg.member.items():
                result.append("     " + member_val)
        if not result:
            result.append(self.NO_SEGMENTATION)
        return result

    def get_member_index_from_the_global_object(self, member_name: str) -> int:
        member_name = member_name.strip()
        for key, val in self._member.items():
            if val == member_name:
                return int(key)
        return -1

    def fill_segments(self, string_segments: str, string_elements: str) -> None:
        self._initialize_segment(string_segments, string_elements)
        self._check_segments_validity()

    def get_segmentation_indices(self, value: str) -> List[int]:
        value = value.strip()
        result: List[int] = []
        if value == self.NO_SEGMENTATION or value in self._segment:
            result = list(range(self._element_count))
        else:
            key = ""
            b = ""
            for seg_name, seg in self._segment.items():
                if value in seg.member.values():
                    key = seg_name
                    for k, v in seg.member.items():
                        if v == value:
                            b = k
                            break
                    break
            if key:
                seg = self._segment[key]
                for j in range(self._element_count):
                    if j < len(seg.elements) and seg.elements[j] == b:
                        result.append(j)
        return result

    def _initialize_segment(self, string_segments: str, string_elements: str) -> None:
        list_segments = self._split_csv_text_to_list(string_segments)
        list_elements = self._split_csv_text_to_list(string_elements)
        if not list_segments or not list_elements:
            return
        header = list_segments[0]
        list_segments = list_segments[1:]
        for i in range(len(header)):
            col_name = (header[i] or "").strip()
            if not col_name:
                continue
            seg = Segment(col_name, self._element_count)
            num = 1
            for row in list_segments:
                if i >= len(row):
                    continue
                val = (row[i] or "").strip()
                if val:
                    seg.member[str(num)] = val
                    self._member[str(len(self._member))] = val
                    num += 1
            seg._member_count = len(seg.member)
            self._member_count = len(self._member)
            elem_list: List[str] = []
            for row in list_elements:
                if i < len(row):
                    text = (row[i] or "").strip()
                    if text:
                        elem_list.append(row[i])
            seg.elements = elem_list
            self._segment[col_name] = seg

    @staticmethod
    def _split_csv_text_to_list(text: str) -> List[List[str]]:
        result: List[List[str]] = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            parts = [p.strip() for p in line.replace("\t", ",").split(",")]
            result.append(parts)
        return result

    def _check_segments_validity(self) -> None:
        errors: List[str] = []
        for seg_name, seg in self._segment.items():
            if seg.element_count != self._element_count:
                errors.append(f"Elements for {seg.name} segment doesn't equal {self._name}")
            for i, el in enumerate(seg.elements):
                if not (el or "").strip():
                    errors.append(f"Elements for {seg.name} at index {i + 1} has empty value")
            for j, el in enumerate(seg.elements):
                if el not in seg.member:
                    errors.append(f"Elements for {seg.name} at index {j + 1} has value [{el}] out of members index")
        if errors:
            raise ValueError("\n".join(errors))
