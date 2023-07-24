from django.db import models
from django.core.exceptions import ValidationError
from isbnlib import canonical, is_isbn10, is_isbn13, to_isbn10, to_isbn13

def validate_canonical_isbn(isbn):
    if isbn != canonical(isbn):
        raise ValidationError(
            f"the ISBN '{isbn}' is not in the canonical form: '{canonical(isbn)}'",
            params={"isbn": isbn}
        )

def validate_isbn_10(isbn):
    if not is_isbn10(isbn):
        raise ValidationError(
            f"The ISBN '{isbn}' is not a valid ISBN-10",
            params={"isbn": isbn}
        )

def validate_isbn_13(isbn):
    if not is_isbn13(isbn):
        raise ValidationError(
            f"The ISBN '{isbn}' is not a valid ISBN-13",
            params={"isbn": isbn}
        )

class Person(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    name = models.CharField(max_length=512)
    birth_year = models.IntegerField(blank=True, null=True)
    ol_id = models.CharField(max_length=512, blank=True, null=True, unique=True)

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
    subtitle = models.CharField(max_length=512, blank=True, null=True)
    edition_name = models.CharField(max_length=512, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    isbn_10 = models.CharField(max_length=10, blank=True, null=True, validators=[validate_isbn_10, validate_canonical_isbn])
    isbn_13 = models.CharField(max_length=13, blank=True, null=True, validators=[validate_isbn_13, validate_canonical_isbn])
    published_by = models.CharField(max_length=512, blank=True, null=True)
    published_place = models.CharField(max_length=512, blank=True, null=True)
    published_year = models.IntegerField(blank=True, null=True)
    authors = models.ManyToManyField(Person, related_name='author_of', blank=True)
    editors = models.ManyToManyField(Person, related_name='editor_of', blank=True)
    subjects = models.ManyToManyField(Subject, blank=True)
    ol_id = models.CharField(max_length=512, blank=True, unique=True)
    location = models.ForeignKey(Location, on_delete=models.SET_NULL, null=True)

    def __str__(self) -> str:
        author_list = ", ".join([author.__str__() for author in self.authors.all()])
        return f"{author_list}: {self.title} ({self.published_year})"
    
    def clean(self) -> None:
        if self.isbn_13:
            self.isbn_10 = to_isbn10(self.isbn_13)
        elif self.is_isbn10:
            self.isbn_13 = to_isbn13(self.isbn_10)
            
        return super().clean()