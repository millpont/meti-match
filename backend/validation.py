"""Small request-validation helpers shared across route modules."""


def date_range_error(start, end, label):
    """Error message if an ISO yyyy-mm-dd end date falls before its start date, else None.
    Incomplete pairs pass — whether a window is required at all is each caller's own rule."""
    if start and end and str(end) < str(start):
        return f"{label} end date can't be before its start date"
    return None


def merged_date_range_error(existing, patch_data, start_key, end_key, label):
    """date_range_error for a PATCH: either side may be omitted from the request, in which case
    the row's current value is what the other side has to be checked against."""
    start = patch_data[start_key] if start_key in patch_data else existing.get(start_key)
    end = patch_data[end_key] if end_key in patch_data else existing.get(end_key)
    return date_range_error(start, end, label)
