Feature: Adding a book by ISBN
  The fastest way to catalogue a book is to type its ISBN into the ISBN field on
  the home page and either press Return or click "Add". The system then queries
  every configured bibliographic source and shows the librarian what each source
  returned, field by field, so they can pick the best value for each field —
  data quality varies wildly between providers and even between individual
  fields of the same record. The book is created from the values the librarian
  chooses, not auto-saved from a single "winning" source.

  In the scenarios below, "look up the ISBN X" means: type X into the home-page
  ISBN field and submit it (by Return or the Add button).

  Background:
    Given I am signed in as "ada"

  Scenario: The lookup is triggered from the home-page ISBN field
    When I type an ISBN into the ISBN field on the home page
    And I submit it by pressing Return
    Then the ISBN lookup runs
    # Clicking the "Add" button instead of pressing Return does the same thing.

  Scenario: Looking up an ISBN gathers candidates from every source
    Given the bibliographic sources return for ISBN "9780261103573":
      | source       | title                      | published_by  | published_year |
      | Libris       | The Fellowship of the Ring | Allen & Unwin |                |
      | Open Library | Fellowship of the Ring     | HarperCollins | 2004           |
      | Bibbi        |                            |               |                |
    When I look up the ISBN "9780261103573"
    Then I am shown a review screen for a new, unsaved book
    And for the field "title" I can choose between "The Fellowship of the Ring" and "Fellowship of the Ring"
    And for the field "published_year" I can choose "2004" offered by "Open Library"

  Scenario: Composing a record from different sources, field by field
    Given the bibliographic sources return for ISBN "9780261103573":
      | source       | title                      | published_by  |
      | Libris       | The Fellowship of the Ring | Allen & Unwin |
      | Open Library | Fellowship of the Ring     | HarperCollins |
    When I look up the ISBN "9780261103573"
    And I choose the "title" offered by "Libris"
    And I choose the "published_by" offered by "Open Library"
    And I save the new book
    Then a new book record is created
    And the saved book's title is "The Fellowship of the Ring"
    And the saved book's publisher is "HarperCollins"
    And the saved book can be found by searching for "9780261103573"

  Scenario: Choosing contributors from a particular source
    Given the bibliographic sources return for ISBN "9780261103573":
      | source       | authors           |
      | Libris       | Tolkien, J. R. R. |
      | Open Library | J. R. R. Tolkien  |
    When I look up the ISBN "9780261103573"
    And I choose the "authors" offered by "Open Library"
    And I save the new book
    Then "J. R. R. Tolkien" is recorded as an author of the saved book

  Scenario: Overriding a field with my own value
    Given the bibliographic sources return for ISBN "9780261103573":
      | source | title       |
      | Libris | Fellowsihp  |
    When I look up the ISBN "9780261103573"
    And I type my own value "The Fellowship of the Ring" for the field "title"
    And I save the new book
    Then the saved book's title is "The Fellowship of the Ring"

  Scenario: No source recognises the ISBN
    Given no bibliographic source recognises ISBN "9780000000002"
    When I look up the ISBN "9780000000002"
    Then I am shown a review screen with no candidate values pre-filled
    And the ISBN I looked up is carried onto the review screen
    And I can fill in every detail by hand and save

  Scenario: One source being unavailable does not block the others
    Given "Libris" is unavailable
    And "Open Library" returns title "The Fellowship of the Ring" for ISBN "9780261103573"
    When I look up the ISBN "9780261103573"
    Then I am shown a review screen for a new, unsaved book
    And the title "The Fellowship of the Ring" is offered by "Open Library"

  Scenario: Discarding the lookup without saving
    Given the bibliographic sources return for ISBN "9780261103573":
      | source | title                      |
      | Libris | The Fellowship of the Ring |
    When I look up the ISBN "9780261103573"
    And I cancel without saving
    Then no book record is created

  Scenario: Rejecting an invalid ISBN before any lookup
    When I try to look up the ISBN "1234567890"
    Then no bibliographic source is queried
    And I am shown an error that the ISBN is not valid
