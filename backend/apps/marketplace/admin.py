"""Admin configuration for marketplace app."""
from django.contrib import admin
from .models import Template, TemplateCategory, TemplateRating

admin.site.register(TemplateCategory)
admin.site.register(Template)
admin.site.register(TemplateRating)
