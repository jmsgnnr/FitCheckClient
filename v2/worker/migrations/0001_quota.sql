CREATE TABLE search_quota (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  used INTEGER NOT NULL
);

INSERT INTO search_quota (id, used) VALUES (1, 0);
