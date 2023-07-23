from django.db import models

class Person(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    name = models.CharField(max_length=512)
    birth_year = models.IntegerField()
    ol_id = models.CharField(max_length=512, blank=True, unique=True)

    def __str__(self) -> str:
        return f"{self.name} ({self.birth_year})"

class Location(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    name = models.CharField(unique=True, max_length=512)

    def __str__(self) -> str:
        return self.name

class Subject(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    name = models.CharField(max_length=512, unique=True) 

    def __str__(self) -> str:
        return self.name

class Book(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    title = models.CharField(max_length=512)
    subtitle = models.CharField(max_length=512, blank=True)
    edition_name = models.CharField(max_length=512, blank=True)
    description = models.TextField(blank=True)
    isbn_13 = models.CharField(max_length=13, blank=True)
    published_by = models.CharField(max_length=512)
    published_place = models.CharField(max_length=512)
    published_year = models.IntegerField()
    authors = models.ManyToManyField(Person, related_name='author_of', blank=True)
    editors = models.ManyToManyField(Person, related_name='editor_of', blank=True)
    subjects = models.ManyToManyField(Subject, blank=True)
    ol_id = models.CharField(max_length=512, blank=True, unique=True)
    location = models.ForeignKey(Location, on_delete=models.SET_NULL, null=True)

    def __str__(self) -> str:
        author_list = ", ".join([author.__str__() for author in self.authors.all()])
        return f"{author_list}: {self.title} ({self.published_year})"
