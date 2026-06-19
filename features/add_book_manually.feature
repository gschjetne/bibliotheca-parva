Feature: Adding a book without an ISBN
  Not every book has an ISBN — older, antiquarian, or self-published volumes may
  have none. The librarian can create an empty record and fill it in entirely by
  hand.

  Background:
    Given I am signed in as "ada"

  Scenario: Creating a blank book to fill in by hand
    When I choose to add a book without entering an ISBN
    Then a new blank book record is created
    And I am taken to that book's edit page
    And I can enter the title and every other detail myself
