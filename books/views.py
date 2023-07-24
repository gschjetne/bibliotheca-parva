from django.http import HttpResponse
from django.shortcuts import render
from django.template import loader

from .models import Book

def index(request):
    template = loader.get_template("index.html")
    return HttpResponse(template.render({}, request))

def search(request):
    def to_dict(book):
        return {
            'id': book.id,
            'isbn': book.isbn_13 if book.isbn_13 else '',
            'title': book.title,
            'authors': ', '.join([a.name for a in book.authors.all()]),
            'location': book.location.name if book.location else None,
        }

    query = request.POST['query']

    books = []

    if query:
        by_title = Book.objects.filter(title__icontains=query)
        by_isbn_13 = Book.objects.filter(isbn_13__startswith=query)
        by_isbn_10 = Book.objects.filter(isbn_10__startswith=query)

        books = (by_title | by_isbn_13 | by_isbn_10)[:50]

    template = loader.get_template("search.html")
    return HttpResponse(template.render({'books': map(to_dict, books)}, request))