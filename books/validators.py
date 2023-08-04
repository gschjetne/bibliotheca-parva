from django.core.exceptions import ValidationError
from isbnlib import canonical, is_isbn10, is_isbn13
from iso639 import Lang
from iso639.exceptions import InvalidLanguageValue, DeprecatedLanguageValue 

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

def validate_iso_639_pt3(code):
    try:
        language = Lang(code)
        if language.pt3 != code:
            raise ValidationError(
                f"'{code}' is not the ISO 639 part 3 code for {language.name}. Instead use '{language.pt3}'",
                params={"code": code}
            )
    except InvalidLanguageValue:
        raise ValidationError(
            f"'{code}' is not a recognisable ISO 639 language code",
            params={"code": code}
        )
    except DeprecatedLanguageValue as e:
        new = Lang(e.change_to)
        raise ValidationError(
            f"The language {e.name} has been deprecated in favour of {new.name}. Instead use '{new.pt3}'",
            params={"code": code}
        )