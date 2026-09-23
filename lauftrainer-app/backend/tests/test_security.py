from app.core.security import (
    create_access_token,
    create_oauth_state,
    decode_access_token,
    hash_password,
    verify_oauth_state,
    verify_password,
)


def test_password_hash_roundtrip():
    hashed = hash_password("correct-horse-battery-staple")
    assert hashed != "correct-horse-battery-staple"
    assert verify_password("correct-horse-battery-staple", hashed)
    assert not verify_password("wrong-password", hashed)


def test_access_token_roundtrip():
    token = create_access_token(user_id=42, role="athlete")
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "42"
    assert payload["role"] == "athlete"


def test_invalid_token_returns_none():
    assert decode_access_token("not-a-real-token") is None


def test_oauth_state_roundtrip():
    state = create_oauth_state(athlete_id=7)
    assert verify_oauth_state(state) == 7


def test_oauth_state_rejects_tampering():
    assert verify_oauth_state("not-a-real-state") is None


def test_oauth_state_rejects_plain_athlete_id():
    # ein rohes state=str(athlete_id) (die alte, ungesicherte Variante) darf
    # nicht als gueltig durchgehen - genau das war die Luecke, die
    # create_oauth_state/verify_oauth_state schliessen.
    assert verify_oauth_state("7") is None


def test_oauth_state_rejects_foreign_jwt():
    # ein regulaeres Access-Token darf nicht als OAuth-state akzeptiert
    # werden (unterschiedliche "purpose").
    token = create_access_token(user_id=7, role="athlete")
    assert verify_oauth_state(token) is None
