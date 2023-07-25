from django import forms

from .validators import validate_any_isbn

class NewFromIsbnForm(forms.Form):
    isbn = forms.CharField(label='ISBN', max_length='13', required=False, validators=[validate_any_isbn])