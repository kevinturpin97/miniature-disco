"""
Standard pagination classes for the Greenhouse SaaS API.
"""

from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Standard pagination with configurable page size."""

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200
