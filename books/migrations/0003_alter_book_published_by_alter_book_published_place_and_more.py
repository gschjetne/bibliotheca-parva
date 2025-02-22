# Generated by Django 4.2.3 on 2023-07-24 10:28

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('books', '0002_book_isbn_10_alter_book_description_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='book',
            name='published_by',
            field=models.CharField(blank=True, max_length=512, null=True),
        ),
        migrations.AlterField(
            model_name='book',
            name='published_place',
            field=models.CharField(blank=True, max_length=512, null=True),
        ),
        migrations.AlterField(
            model_name='book',
            name='published_year',
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
