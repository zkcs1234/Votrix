export function getItem(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function setItem(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore quota errors */
  }
}

export function removeItem(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function getJSON(key) {
  const raw = getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function setJSON(key, value) {
  setItem(key, JSON.stringify(value))
}
