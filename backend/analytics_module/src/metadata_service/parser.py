import re

import pandas as pd


def extract_question_blocks(content):
    match = re.search(
        r"=+\nQuestionnaire\n=+\n(.*?)\n=+\nRandomization\n=+",
        content,
        re.DOTALL
    )

    if not match:
        raise ValueError("Questionnaire section not found.")

    q_section = match.group(1)
    questions_raw = re.split(r"=+\nQuestion Name: ", q_section)[1:]
    return questions_raw


def _extract_loops_section(content):
    """
    Return the raw Loops section from the study file, or None if not found.
    """
    pattern = re.compile(
        r"=+\s*\r?\nLoops\s*\r?\n=+\s*\r?\n"   # Loops banner
        r"(.*?)"
        r"=+\s*\r?\nSKIP SECTION\s*\r?\n=+",  # up to the next major section
        flags=re.DOTALL | re.IGNORECASE,
    )
    match = pattern.search(content)
    return match.group(1) if match else None


def build_loop_mapping(content, questions_raw):
    """
    Build a mapping: question_name -> {loop, loop_parent_list} using the Loops section.

    This is more reliable than scanning headers for looplabel placeholders because
    the Loops section explicitly tells us which questions belong to each loop,
    e.g. `Page 28 to 29 (WhyUseMOU to NeedsChangeMOU)`.
    """
    loops_section = _extract_loops_section(content)
    if not loops_section:
        return {}

    # Name -> index for all questions in questionnaire order
    name_to_index = {}
    index_to_name = {}
    for idx, block in enumerate(questions_raw):
        q_name = block.split("\n", 1)[0].strip()
        name_to_index[q_name] = idx
        index_to_name[idx] = q_name

    loop_mapping = {}

    # Split into individual loop blocks
    loop_blocks = re.split(r"=+\s*\r?\nLoop Name:\s*", loops_section)[1:]

    for lb in loop_blocks:
        lines = lb.strip().splitlines()
        if not lines:
            continue
        loop_name = lines[0].strip()

        # Parent List
        parent_match = re.search(r"Parent List:\s*([^\r\n]+)", lb)
        loop_parent = parent_match.group(1).strip() if parent_match else None

        # Page range with question names, e.g. (WhyUseMOU to NeedsChangeMOU)
        range_match = re.search(
            r"Page\s+\d+\s+to\s+\d+\s*\(\s*([^)]+?)\s*\)", lb
        )
        if not range_match:
            continue
        q_range = range_match.group(1)
        if " to " not in q_range:
            continue
        start_q, end_q = [p.strip() for p in q_range.split(" to ", 1)]

        if start_q not in name_to_index or end_q not in name_to_index:
            continue

        start_idx = name_to_index[start_q]
        end_idx = name_to_index[end_q]
        if start_idx > end_idx:
            start_idx, end_idx = end_idx, start_idx

        # Assign this loop info to every question between start and end (inclusive)
        for qi in range(start_idx, end_idx + 1):
            qn = index_to_name.get(qi)
            if not qn:
                continue
            loop_mapping[qn] = {
                "loop": loop_name,
                "loop_parent_list": loop_parent,
            }

    return loop_mapping


def parse_question_block(block, content, loop_mapping=None):
    if "Type: Quota" in block:
        return None

    question_name = block.split("\n")[0].strip()

    q_type = re.search(r"Type: (.+)", block)
    question_type = q_type.group(1).strip() if q_type else None

    header_match = re.findall(r"\[Header \d+\]:\n(.+?)\n\n", block, re.DOTALL)
    header = header_match[0].strip() if header_match else None

    response_match = re.search(r"\[Response Options\]:\nList Name: (.+?)\nType: (Predefined|Constructed)", block)
    response_list = response_match.group(1).strip() if response_match else None
    response_type = response_match.group(2).strip() if response_match else None

    parent_list_match = re.search(r"Parent List: (.+)", block)
    parent_list = parent_list_match.group(1).strip() if parent_list_match else None

    # Prefer the explicit Loops section mapping if available
    loop_name = None
    loop_parent_list = None
    if loop_mapping and question_name in loop_mapping:
        loop_name = loop_mapping[question_name]["loop"]
        loop_parent_list = loop_mapping[question_name]["loop_parent_list"]
    else:
        # Fallback: try to infer from looplabel placeholders in the question text
        pat = r"looplabel\s*\((.*?)\)|looplabel\s*:\s*(.*)"
        loop_match = re.search(pat, block, re.IGNORECASE)
        if loop_match:
            loop_name = (loop_match.group(1) or loop_match.group(2) or "").strip() or None
        if loop_name:
            pattern = rf"Loop Name:\s*{re.escape(loop_name)}.*?Parent List:\s*(\S+)"
            match = re.search(pattern, content, flags=re.DOTALL)
            loop_parent_list = match.group(1) if match else None


    return {
        "question_name": question_name,
        "question_type": question_type,
        "header": header,
        "list_name": response_list,
        "list_type": response_type,
        "parent_list": parent_list,
        "loop": loop_name,
        "loop_parent_list": loop_parent_list
    }

def parse_grid_question(block):
    question_name = block.split("\n")[0].strip()

    # Question Direction
    direction_match = re.search(r"Question Direction:\s*(.+)", block)
    question_direction = direction_match.group(1).strip() if direction_match else None

    # Response Type (from first row)
    response_match = re.search(r"\[Row 1\]:\s*\nType:\s*(.+)", block)
    response_type = response_match.group(1).strip() if response_match else None

    # Row List
    row_list_match = re.search(r"\[Row List\]:\nList Name:\s*(.+?)\nType:\s*(.+)", block)
    row_list_name = row_list_match.group(1).strip() if row_list_match else None
    row_list_type = row_list_match.group(2).strip() if row_list_match else None

    # TODO
    row_parent_match = re.search(r'^\s*\[Row List\].*?List Name:\s*([^\r\n]+)', block, flags=re.DOTALL | re.MULTILINE)
    row_list_parent = row_parent_match.group(1).strip() if row_parent_match else None

    # Column List
    col_list_match = re.search(r"\[Column List\]:\nList Name:\s*(.+?)\nType:\s*(.+)", block)
    col_list_name = col_list_match.group(1).strip() if col_list_match else None
    col_list_type = col_list_match.group(2).strip() if col_list_match else None

    # Column Parent List
    col_parent_match = re.search(r'\s*\[Column List\]\s*:?.*?Parent List:\s*([^\r\n]+)', block,
                                 flags=re.DOTALL | re.MULTILINE)
    col_parent_list = col_parent_match.group(1).strip() if col_parent_match else None

    return {
        "question_name": question_name,
        "question_direction": question_direction,
        "response_type": response_type,
        "row_list_name": row_list_name,
        "row_list_type": row_list_type,
        "row_list_parent": row_list_parent,
        "col_list_name": col_list_name,
        "col_list_type": col_list_type,
        "col_parent_list": col_parent_list
    }

def parse_questions(file_path):
    """Main function to process the questionnaire into dataframes."""
    with open(file_path, encoding="utf-8") as file:
        content = file.read()

    questions_raw = extract_question_blocks(content)
    loop_mapping = build_loop_mapping(content, questions_raw)

    questions = []
    grid_questions = []
    loop_questions = []

    for block in questions_raw:
        if "Type: Grid" in block:
            grid_questions.append(parse_grid_question(block))
        else:
            result = parse_question_block(block, content, loop_mapping=loop_mapping)
            if result:
                questions.append(result)

    df_main = pd.DataFrame(questions)
    df_grids = pd.DataFrame(grid_questions)

    return df_main, df_grids

def extract_list_section(file_path):
    with open(file_path, encoding="utf-8") as file:
        content = file.read()

    pattern = re.compile(
        r"=+\s*\r?\nLIST SECTION\s*\r?\n=+\s*\r?\n"  # opening banner + title
        r"(.*?)"  # capture everything in between
        r"=+\s*\r?\nSTUDY SETTINGS\s*\r?\n=+\s*",  # closing banner + next title
        re.DOTALL | re.IGNORECASE
    )

    match = pattern.search(content)
    if not match:
        raise ValueError("LIST SECTION not found")

    return match.group(1)

def parse_lists(study_path):
    list_section = extract_list_section(study_path)

    list_blocks = re.split(r"=+\nList Name: ", list_section)[1:]

    codebook = {}

    for block in list_blocks:
        lines = block.strip().splitlines()
        list_name = lines[0].strip()

        # Ignore constructed lists
        if "Type: Constructed" in block:
            continue

        # Extract code-label pairs
        items = re.findall(r"(\d+)\t([^\n]+)", block)
        if not items:
            continue

        # Clean labels: replace Respondent Specify notes with [specify]
        cleaned_items = {
            int(code): re.sub(r"\[Respondent Specify[^\]]*\]", "[Specify]", label.strip())
            for code, label in items
        }

        codebook[list_name] = cleaned_items

    # Convert to DataFrame
    codebook_df = pd.DataFrame.from_dict(codebook, orient='columns')
    codebook_df = codebook_df.reset_index()
    return codebook_df


def get_respondent_specify_only_questions(file_path):
    """
    Returns a list of question names where all response options are [Respondent Specify].

    Args:
        file_path (str): Path to the survey file

    Returns:
        list: Question names with only [Respondent Specify] options
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split into question sections
    questions = content.split('===========================\nQuestion Name: ')[1:]

    respondent_specify_questions = []

    for question in questions:
        lines = question.split('\n')
        question_name = lines[0].strip()

        # Check if this question has response options
        if '[Response Options]:' not in question:
            continue

        # Extract the response options section
        response_section_start = question.find('[Response Options]:')
        response_section_end = question.find('\n[', response_section_start + 1)

        if response_section_end == -1:
            response_section_end = question.find('\n===', response_section_start + 1)
        if response_section_end == -1:
            response_section_end = len(question)

        response_section = question[response_section_start:response_section_end]

        # Extract all option lines (lines that start with a number and tab)
        option_lines = []
        for line in response_section.split('\n'):
            # Match lines that start with number + tab
            if line and line[0].isdigit() and '\t' in line:
                option_lines.append(line)

        if not option_lines:
            continue

        # Check if all options contain only [Respondent Specify]
        all_respondent_specify = True
        for option_line in option_lines:
            # Get the text after the number and tab
            option_text = option_line.split('\t', 1)[1].strip()

            # Check if there's any text before the opening bracket
            bracket_start = option_text.find('[')
            if bracket_start > 0:
                # There's text before the bracket, exclude this question
                all_respondent_specify = False
                break

            # Check if it's ONLY [Respondent Specify] with possible modifiers
            if not (option_text.startswith('[Respondent Specify') and option_text.endswith(']')):
                all_respondent_specify = False
                break

        if all_respondent_specify and len(option_lines) > 0:
            respondent_specify_questions.append(question_name)

    return respondent_specify_questions

def run(study_path):

    meta_data, meta_grids = parse_questions(study_path)
    codebook_df = parse_lists(study_path)
    unaided_lst = get_respondent_specify_only_questions(study_path)
    for q in unaided_lst:
        meta_data.loc[meta_data['question_name'] == q,'question_type'] = 'Unaided'
    return meta_data, meta_grids, codebook_df
