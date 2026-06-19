Feature: ISBN handling
  Books are identified by ISBN. The librarian may type an ISBN in either the
  10- or 13-digit form, with or without dashes, and the system treats all of
  these as the same book — both when adding and when searching. How the ISBN is
  stored internally, and whether one form or both are kept, is not the
  librarian's concern and is deliberately not specified here.

  Background:
    Given I am signed in as "ada"

  Scenario Outline: A book can be looked up for adding by any form of its ISBN
    When I look up the ISBN "<entered>"
    Then the ISBN is accepted and the lookup proceeds

    Examples:
      | entered           |
      | 9780261103573     |
      | 978-0-261-10357-3 |
      | 0261103571        |
      | 0-261-10357-1     |

  Scenario Outline: A catalogued book is found by any form of its ISBN
    Given a book "The Fellowship of the Ring" with ISBN "9780261103573" exists
    When I search for "<query>"
    Then the results include "The Fellowship of the Ring"

    Examples:
      | query             |
      | 9780261103573     |
      | 978-0-261-10357-3 |
      | 0261103571        |
      | 0-261-10357-1     |

  Scenario: A book is found by either ISBN form regardless of how it was added
    Given a book "The Fellowship of the Ring" was added by ISBN "0261103571"
    When I search for "9780261103573"
    Then the results include "The Fellowship of the Ring"

  Scenario: The book editor has a single ISBN field that accepts any format
    Given a book "The Two Towers" exists
    When I edit the book and set its ISBN to "978-0-261-10236-1"
    Then the ISBN is accepted
    And the book can afterwards be found by searching for "0261102362"

  Scenario Outline: Rejecting an invalid ISBN
    When I try to look up the ISBN "<entered>"
    Then it is rejected as not a valid ISBN

    Examples:
      | entered       |
      | 1234567890    |
      | 9780261103579 |
      | not-an-isbn   |
