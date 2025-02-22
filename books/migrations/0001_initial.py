# Generated by Django 4.2.3 on 2023-07-23 17:03

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='Location',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=512, unique=True)),
            ],
        ),
        migrations.CreateModel(
            name='Person',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=512)),
                ('birth_year', models.IntegerField()),
                ('ol_id', models.CharField(blank=True, max_length=512, unique=True)),
            ],
        ),
        migrations.CreateModel(
            name='Subject',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=512, unique=True)),
            ],
        ),
        migrations.CreateModel(
            name='Book',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=512)),
                ('subtitle', models.CharField(blank=True, max_length=512)),
                ('edition_name', models.CharField(blank=True, max_length=512)),
                ('description', models.TextField(blank=True)),
                ('isbn_13', models.CharField(blank=True, max_length=13)),
                ('published_by', models.CharField(max_length=512)),
                ('published_place', models.CharField(max_length=512)),
                ('published_year', models.IntegerField()),
                ('ol_id', models.CharField(blank=True, max_length=512, unique=True)),
                ('authors', models.ManyToManyField(blank=True, related_name='author_of', to='books.person')),
                ('editors', models.ManyToManyField(blank=True, related_name='editor_of', to='books.person')),
                ('location', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to='books.location')),
                ('subjects', models.ManyToManyField(blank=True, to='books.subject')),
            ],
        ),
    ]
