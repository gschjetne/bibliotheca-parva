import re
from django.db import models
from isbnlib import to_isbn10, to_isbn13
import requests

from books.validators import validate_canonical_isbn, validate_isbn_10, validate_isbn_13

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
    title = models.CharField(max_length=512, blank=True, null=True)
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
    ol_id = models.CharField(max_length=512, blank=True, null=True)
    location = models.ForeignKey(Location, on_delete=models.SET_NULL, blank=True, null=True)

    def __str__(self) -> str:
        author_list = ", ".join([author.__str__() for author in self.authors.all()])
        return f"{author_list}: {self.title} ({self.published_year})"
    
    def clean(self) -> None:
        if self.isbn_13:
            self.isbn_10 = to_isbn10(self.isbn_13)
        elif self.is_isbn10:
            self.isbn_13 = to_isbn13(self.isbn_10)
            
        return super().clean()
    
    def fetch_metadata(self):
        res = requests.get(f"https://openlibrary.org/isbn/{self.isbn_13}.json")
        if res.ok:
            ol = res.json()

            if 'authors' in ol:
                if not self.id:
                    self.save()

                author_ids = []
                for a in ol['authors']:
                    a_key = a['key']
                    a_res = requests.get(f"https://openlibrary.org{a_key}.json")
                    if a_res.ok:
                        a_json = a_res.json()
                        name = a_json['name'] if 'name' in a_json else "Anonymous"
                        person, _ = Person.objects.get_or_create(name=name)
                        author_ids.append(person.id)
                        if person.ol_id != a_key:
                            person.ol_id = a_key
                            person.save()

                self.authors.set(author_ids)
            
            if 'subjects' in ol:
                if not self.id:
                    self.save()

                subject_ids = [Subject.objects.get_or_create(name=subject_name)[0].id for subject_name in ol['subjects']]
                self.subjects.set(subject_ids)
            
            self.title = ol['title']
            if 'subtitle' in ol: self.subtitle = ol['subtitle']
            if 'edition_name' in ol: self.edition_name = ol['edition_name']
            if 'description' in ol: self.description = ol['description']['value']
            if 'publisher' in ol: self.published_by = ", ".join(ol['publisher'])
            if 'publish_places' in ol: self.published_place = ", ".join(ol['publish_places'])
            if 'publish_date' in ol: self.published_year = re.search('\d{4}', ol['publish_date']).group(0)
            self.ol_id = ol['key']
            
            
            