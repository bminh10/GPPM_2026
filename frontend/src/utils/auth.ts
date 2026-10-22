const AUTH_KEY = 'campusopt:authenticated'

export const isAuthenticated = () => localStorage.getItem(AUTH_KEY) === 'true'

export const markAuthenticated = () => localStorage.setItem(AUTH_KEY, 'true')

export const clearAuthentication = () => localStorage.removeItem(AUTH_KEY)
