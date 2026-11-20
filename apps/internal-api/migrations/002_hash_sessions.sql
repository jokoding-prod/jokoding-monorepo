-- sessions.id now stores sha256(cookie id) as hex. Raw ids cannot be converted, so everyone is logged out once.
delete from sessions;
