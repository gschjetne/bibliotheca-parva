from django.contrib import admin

from .models import Person, Book, Location, Subject

admin.site.register(Person)
admin.site.register(Book)
admin.site.register(Location)
admin.site.register(Subject)