from django.http import HttpResponse, HttpResponseRedirect
from django.template import loader
import isbnlib
from .forms import NewFromIsbnForm
from .models import Book

def index(request):
    if request.method == 'POST':
        form = NewFromIsbnForm(request.POST)
        if form.is_valid():
            book = Book()
            if 'isbn' in form.cleaned_data:
                isbn = form.cleaned_data['isbn']
                book.isbn_10 = isbnlib.canonical(isbnlib.to_isbn10(isbn))
                book.isbn_13 = isbnlib.canonical(isbnlib.to_isbn13(isbn))
                book.fetch_metadata()
                book.save()
                return HttpResponseRedirect(f"/admin/books/book/{book.id}/change/")
            else:
                return HttpResponseRedirect("/admin/books/book/add/")
    else:
        form = NewFromIsbnForm()

    template = loader.get_template("index.html")
    return HttpResponse(template.render({'form': form}, request))

def search(request):
    def to_dict(book):
        authors = [a.name for a in book.authors.all()]
        editors = [f"{e.name} (ed.)" for e in book.editors.all()]

        return {
            'id': book.id,
            'isbn': isbnlib.mask(book.isbn_13) if book.isbn_13 else '',
            'title': book.title if book.title else 'Missing Title',
            'subtitle': book.subtitle if book.subtitle else '',
            'authors': ', '.join(authors + editors),
            'location': book.location.name if book.location else None,
        }

    query = request.GET['query'] if 'query' in request.GET else None

    books = []

    if query:
        by_title = Book.objects.filter(title__icontains=query)
        by_isbn_13 = Book.objects.filter(isbn_13__startswith=query)
        by_isbn_10 = Book.objects.filter(isbn_10__startswith=query)

        books = (by_title | by_isbn_13 | by_isbn_10).order_by('title')[:50]

    template = loader.get_template("search.html")
    return HttpResponse(template.render({'books': map(to_dict, books)}, request))