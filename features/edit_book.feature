Feature: Editing a book's details
  After a book is added — whether by ISBN or by hand — the librarian can review
  and correct every detail of the record, record who contributed to it and in
  what capacity, note where it is shelved, and remove records that were added by
  mistake.

  Background:
    Given I am signed in as "ada"
    And a book titled "The Fellowship of the Ring" exists

  Scenario: Correcting the title and subtitle
    When I edit the book and set:
      | title    | The Fellowship of the Ring |
      | subtitle | being the first part of The Lord of the Rings |
    Then the saved book's title is "The Fellowship of the Ring"
    And the saved book's subtitle is "being the first part of The Lord of the Rings"

  Scenario: Recording the bibliographic details
    When I edit the book and set:
      | original_title | The Fellowship of the Ring |
      | edition_name   | 50th Anniversary Edition   |
      | published_by   | HarperCollins              |
      | published_place| London                     |
      | published_year | 2004                       |
      | description    | The first volume of the trilogy. |
    Then those details are saved on the book

  Scenario: Recording contributors and their roles
    When I add "J. R. R. Tolkien" to the book as an author
    And I add "Alan Lee" to the book as an illustrator
    And I add "Åke Ohlmarks" to the book as a translator
    Then "J. R. R. Tolkien" is recorded as an author of the book
    And "Alan Lee" is recorded as an illustrator of the book
    And "Åke Ohlmarks" is recorded as a translator of the book

  Scenario: A person may hold more than one role across the catalogue
    Given a book "The Silmarillion" exists
    When I add "Christopher Tolkien" to "The Silmarillion" as an editor
    And I add "Christopher Tolkien" to "The Fellowship of the Ring" as a foreword writer
    Then "Christopher Tolkien" is recorded as an editor of "The Silmarillion"
    And "Christopher Tolkien" is recorded as a foreword writer of "The Fellowship of the Ring"

  Scenario: Removing a contributor
    Given "Alan Lee" is recorded as an illustrator of the book
    When I remove "Alan Lee" from the book
    Then "Alan Lee" is no longer recorded as a contributor of the book

  Scenario: Recording where the book is shelved
    When I set the book's location to "Living room, top shelf"
    Then the saved book's location is "Living room, top shelf"

  Scenario: Saving returns the librarian to the page they came from
    Given I opened the book's edit page from the search results
    When I edit the book and save it
    Then the edit is saved
    And I am taken back to the search results I came from
    And a confirmation offers a link to continue editing the book

  Scenario: Recording subjects and keywords
    When I add the subjects "Fantasy" and "Middle-earth" to the book
    Then the book is filed under "Fantasy"
    And the book is filed under "Middle-earth"

  Scenario: Recording the languages of a book from a friendly picker
    When I choose "English" from the language picker
    Then the saved book lists "English" as a language
    And the language is stored internally as a stable language code

  Scenario: Only recognised languages can be recorded
    Then the language picker offers "English" but not "Klingon"
    And there is no way to record an unrecognised language

  Scenario: Deleting a book
    When I delete the book
    Then the book no longer appears in search results
    And no contributors are left orphaned by the deletion
