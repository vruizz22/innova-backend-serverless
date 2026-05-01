# Rule Engine Catalog (MVP)

## Topic: subtraction_borrow

Supported error types in this MVP module:

- BORROW_OMITTED
- BORROW_FROM_ZERO_ERROR
- SIGN_ERROR
- SUBTRAHEND_MINUEND_SWAPPED
- PLACE_VALUE_ERROR
- BASIC_FACT_ERROR
- PARTIAL_BORROW_ERROR
- UNCLASSIFIED

This initial implementation includes deterministic, low-latency pattern checks. Any low-confidence or unknown output should be routed asynchronously to the LLM queue.
