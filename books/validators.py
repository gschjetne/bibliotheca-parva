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
    
def validate_any_isbn(isbn):
    try:
        validate_isbn_10(isbn)
    except ValidationError:
        validate_isbn_13(isbn)