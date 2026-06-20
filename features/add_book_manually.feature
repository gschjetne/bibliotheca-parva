Feature: Adding a book without an ISBN
  Not every book has an ISBN — older, antiquarian, or self-published volumes may
  have none. Pressing "Add" on the home page with the ISBN field empty (or
  visiting the add page with no ISBN) opens a full, blank book form — not just an
  ISBN field — so the librarian can fill in the title and every other detail by
  hand and save a record for a book that has no ISBN at all.

  Background:
    Given I am signed in as "ada"

  Scenario: Pressing Add with an empty ISBN field opens a blank book form
    When I press "Add" on the home page with the ISBN field empty
    Then I am shown a full blank book form, not just an ISBN field
    And no bibliographic source is queried
    And I can enter the title and every other detail myself

  Scenario: Saving a hand-entered book with no ISBN
    Given I have opened a blank book form
    When I enter a title and save
    Then a new book record is created with no ISBN
    And I am taken to that book's edit page
