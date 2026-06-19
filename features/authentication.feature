Feature: Access control
  Bibliotheca Parva is a private home library. Access is gated at the edge by
  Cloudflare Access (Zero Trust): only identities the household has authorised
  may reach the application at all, and the application itself trusts — and
  verifies — the identity that Access passes through.

  Scenario: An unauthenticated visitor cannot reach the catalogue
    Given I have not authenticated with Cloudflare Access
    When I open any page of the library
    Then I am sent to the Cloudflare Access login
    And the application never receives my request

  Scenario: An authorised household member is allowed in
    Given my identity is on the Access allow-list
    And I have authenticated with Cloudflare Access
    When I open the library home page
    Then I see the catalogue
    And the application knows who I am from the verified Access identity

  Scenario: An authenticated but unauthorised person is denied
    Given I have authenticated with Cloudflare Access
    But my identity is not on the Access allow-list
    When I open the library
    Then Access denies me
    And the application never receives my request

  Scenario: The application refuses requests lacking a valid Access identity
    # Defence in depth: the Worker validates the Access JWT and rejects any
    # request that does not carry a valid one, in case it is ever reached
    # directly, bypassing the Access-protected hostname.
    When a request reaches the Worker without a valid Access identity token
    Then the application refuses it
