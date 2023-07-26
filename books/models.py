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
        elif self.isbn_10:
            self.isbn_13 = to_isbn13(self.isbn_10)
            
        return super().clean()
    
    def fetch_metadata(self):
        self.fetch_libris_metadata() or self.fetch_openlibrary_metadata() or self.fetch_bibbi_metadata()
        self.save()

    def fetch_openlibrary_metadata(self):
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
            return True
        else:
            return False
            
    def fetch_bibbi_metadata(self):
        res = requests.get('https://bibliografisk.bs.no/v1/works', {'query': self.isbn_13})
        if res.ok:
            json = res.json()
            if json['total'] != 1:
                return False
            
            bibbi = json['works'][0]

            if 'creator' in bibbi:
                author_names = [" ".join(reversed(a['name'].split(', '))) for a in bibbi['creator']]
                author_ids = [Person.objects.get_or_create(name=name)[0].id for name in author_names]
                if not self.id: self.save()
                self.authors.set(author_ids)

            if 'name' in bibbi:
                self.title = bibbi['name']
            
            pub = next(filter(lambda e : e['isbn'] == self.isbn_13, bibbi['publications']), None)
            
            if pub:
                subject_names = []
                if 'name' in pub: self.title = pub['name']
                if 'description' in pub: self.description = pub['description']
                    
                if 'about' in pub:
                    for s in pub['about']:
                        subject_names.append(s['name']['nob'])
                    

                if 'genre' in pub:
                    for g in pub['genre']:
                        subject_names.append(g['name']['nob'])
                        
                if 'datePublished' in pub: self.year = re.search('\d{4}', pub['datePublished']).group(0)

                subject_ids = [Subject.objects.get_or_create(name=name)[0].id for name in subject_names]
                if not self.id: self.save()
                self.subjects.set(subject_ids)

            return True
        else:
            return False
        
    def fetch_libris_metadata(self):
        data = requests.get('http://libris.kb.se/xsearch', {'query': f'NUMM:{self.isbn_13}', 'format': 'refworks'}).text
        found = False

        for book in data.split('\r\n\r\n'):
            if f"SN {self.isbn_13}" in book:
                found = True

                publishers = []
                publish_places = []
                author_names = []
                editor_names = []
                subjects = []

                for claim in book.split('\r\n'):
                    if len(claim) < 4: continue

                    key = claim[:2]
                    value = claim[3:]

                    if key == 'T1': # Primary Title
                        self.title = value
                    elif key == 'T2': # Secondary Title
                        self.subtitle = value
                    elif key == 'ED': # Edition
                        self.edition_name = value
                    elif key == 'AB': # Abstract
                        self.description = value
                    elif key == 'PB': # Publisher
                        publishers.append(value)
                    elif key == 'PP': # Place of Publication
                        publish_places.append(value)
                    elif key == 'YR': # Year of Publication
                        self.published_year = value
                    elif key == 'A1': # Author
                        author_names.append(" ".join(reversed(value.split(', '))))
                    elif key == 'A2': # Editor
                        editor_names.append(" ".join(reversed(value.split(', '))))
                    elif key == 'K1': # Keyword
                        subjects.append(value)

                if publishers:
                    self.published_by = ", ".join(publishers)

                if publish_places:
                    self.published_place = ", ".join(publish_places)

                if author_names:
                    author_ids = [Person.objects.get_or_create(name=name)[0].id for name in author_names]
                    if not self.id: self.save()
                    self.authors.set(author_ids)

                if editor_names:
                    editor_ids = [Person.objects.get_or_create(name=name)[0].id for name in editor_names]
                    if not self.id: self.save()
                    self.editors.set(editor_ids)

                if subjects:
                    subject_ids = [Subject.objects.get_or_create(name=name)[0].id for name in subjects]
                    if not self.id: self.save()
                    self.subjects.set(subject_ids)

        return found