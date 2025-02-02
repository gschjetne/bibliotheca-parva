from django.urls import path, include

from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("search", views.search, name="search"),
    path("accounts/", include("django.contrib.auth.urls"))
]
