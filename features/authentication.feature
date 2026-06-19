Feature: Authentication
  Bibliotheca Parva is a private home library. Only household members with an
  account may see or change the catalogue, so every page requires a signed-in
  user.

  Scenario: An anonymous visitor cannot reach the catalogue
    Given I am not signed in
    When I open any page of the library
    Then I am redirected to the login page

  Scenario: Signing in with valid credentials
    Given an account exists with username "ada" and password "correct-horse"
    And I am not signed in
    When I sign in as "ada" with password "correct-horse"
    Then I land on the library home page

  Scenario: Signing in with the wrong password is rejected
    Given an account exists with username "ada" and password "correct-horse"
    And I am not signed in
    When I sign in as "ada" with password "wrong-password"
    Then I remain on the login page
    And I am shown an authentication error
    And I am still not signed in

  Scenario: Signing out
    Given I am signed in as "ada"
    When I sign out
    Then I am no longer signed in
    And opening the library home page redirects me to the login page
