from django.http import HttpResponse
from django.shortcuts import render

def index(request):
    return HttpResponse("At the books index")
