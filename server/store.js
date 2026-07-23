const crypto = require('node:crypto');

const users = [];

function listUsers() {
  return [...users];
}

function createUser({ name, email, passwordHash, role }) {
  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash,
    role,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  return user;
}

function findUserByEmail(email) {
  return users.find((user) => user.email === email);
}

function findUserById(id) {
  return users.find((user) => user.id === id);
}

module.exports = { listUsers, createUser, findUserByEmail, findUserById };
