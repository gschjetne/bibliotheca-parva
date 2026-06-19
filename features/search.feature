Feature: Searching the catalogue
  The home page has a single search box that filters the catalogue as the
  librarian types, so a book can be found by title, by a contributor's name, or
  by ISBN.

  Background:
    Given I am signed in as "ada"
    And the catalogue contains:
      | title                      | subtitle                | authors          | isbn_13       |
      | The Fellowship of the Ring | being the first part    | J. R. R. Tolkien | 9780261103573 |
      | The Two Towers             | being the second part   | J. R. R. Tolkien | 9780261102361 |
      | Cooking for Geeks          |                         | Jeff Potter      | 9780596805883 |

  Scenario: Finding books by a word in the title
    When I search for "towers"
    Then the results include "The Two Towers"
    And the results do not include "Cooking for Geeks"

  Scenario: Search matches anywhere in the title, not just the start
    When I search for "geeks"
    Then the results include "Cooking for Geeks"

  Scenario: Search is case-insensitive
    When I search for "FELLOWSHIP"
    Then the results include "The Fellowship of the Ring"

  Scenario: Finding books by a word in the subtitle
    When I search for "second part"
    Then the results include "The Two Towers"

  Scenario: Finding books by a contributor's name
    When I search for "Tolkien"
    Then the results include "The Fellowship of the Ring"
    And the results include "The Two Towers"
    And the results do not include "Cooking for Geeks"

  Scenario: Finding a book by its ISBN
    # ISBN form-independence (10/13, with/without dashes) is covered in
    # isbn_handling.feature.
    When I search for "9780596805883"
    Then the results include "Cooking for Geeks"

  Scenario: A book matched by two terms appears only once
    When I search for "Tolkien"
    Then "The Fellowship of the Ring" appears exactly once in the results

  Scenario: Results are ordered by title and capped
    Given the catalogue contains 60 books whose titles contain "Manual"
    When I search for "Manual"
    Then at most 50 results are shown
    And the results are ordered by title

  Scenario: Each result shows the book's key details and an edit link
    When I search for "Fellowship"
    Then the result for "The Fellowship of the Ring" shows the contributors "J. R. R. Tolkien"
    And the result for "The Fellowship of the Ring" links to that book's edit page

  Scenario: Contributor roles are annotated in the result
    Given a book "The Annotated Hobbit" with:
      | authors      | J. R. R. Tolkien |
      | editors      | Douglas A. Anderson |
      | illustrators | Alan Lee |
      | translators  | Åke Ohlmarks |
    When I search for "Annotated Hobbit"
    Then the result for "The Annotated Hobbit" shows the contributors "J. R. R. Tolkien, Douglas A. Anderson (ed.), Alan Lee (ill.), Åke Ohlmarks (tr.)"

  Scenario: An empty search box shows no results
    # Decided: keep current behaviour — the catalogue is shown only once the
    # librarian types something.
    When I search for ""
    Then no results are shown
