"""Admin configuration for notifications app."""
from django.contrib import admin
from .models import NotificationChannel, NotificationLog, NotificationRule, PushSubscription

admin.site.register(NotificationChannel)
admin.site.register(NotificationRule)
admin.site.register(NotificationLog)
admin.site.register(PushSubscription)
