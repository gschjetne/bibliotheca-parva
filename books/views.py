from django.http import HttpResponse, HttpResponseRedirect
from django.template import loader
import isbnlib
from .forms import NewFromIsbnForm
from .models import Book
from django.contrib.auth.decorators import login_required
from iso639 import Lang

@login_required
def index(request):
    if request.method == 'POST':
        form = NewFromIsbnForm(request.POST)
        if form.is_valid():
            book = Book()
            isbn = form.cleaned_data['isbn']
            if isbn:
                book.isbn_10 = isbnlib.canonical(isbnlib.to_isbn10(isbn))
                book.isbn_13 = isbnlib.canonical(isbnlib.to_isbn13(isbn))
                book.fetch_metadata()
                return HttpResponseRedirect(f"/admin/books/book/{book.id}/change/")
            else:
                return HttpResponseRedirect("/admin/books/book/add/")
    else:
        form = NewFromIsbnForm()

    template = loader.get_template("index.html")
    return HttpResponse(template.render({'form': form}, request))

@login_required
def search(request):
    def to_dict(book):
        authors = [a.name for a in book.authors.all()]
        editors = [f"{e.name} (ed.)" for e in book.editors.all()]
        illustrators = [f"{e.name} (ill.)" for e in book.illustrators.all()]
        translators = [f"{e.name} (tr.)" for e in book.translators.all()]
        languages = [Lang(pt3).name for pt3 in book.languages] if book.languages else []

        return {
            'id': book.id,
            'isbn': isbnlib.mask(book.isbn_13) if book.isbn_13 else 'N/A',
            'title': book.title if book.title else 'Missing Title',
            'subtitle': book.subtitle if book.subtitle else '',
            'contributors': ', '.join(authors + editors + illustrators + translators),
            'location': book.location.name if book.location else None,
            'languages': ', '.join(languages),
        }

    query = request.GET['query'] if 'query' in request.GET else None

    books = []

    if query:
        filter = Book.objects.filter(title__icontains=query) |\
            Book.objects.filter(subtitle__icontains=query) |\
            Book.objects.filter(authors__name__icontains=query) |\
            Book.objects.filter(editors__name__icontains=query) |\
            Book.objects.filter(illustrators__name__icontains=query) |\
            Book.objects.filter(translators__name__icontains=query) |\
            Book.objects.filter(isbn_13__startswith=query) |\
            Book.objects.filter(isbn_10__startswith=query)

        books = filter.order_by('title').distinct()[:50]

    template = loader.get_template("search.html")
    return HttpResponse(template.render({'books': map(to_dict, books)}, request))
