import apiUrl from '../apiConfig'
import axios from 'axios'
import {
  buildSignUpOptions,
  buildSignInOptions,
  buildSignOutOptions,
  buildChangePasswordOptions
} from './requestContracts'

export const signUp = credentials => {
  return axios(buildSignUpOptions(apiUrl, credentials))
}

export const signIn = credentials => {
  return axios(buildSignInOptions(apiUrl, credentials))
}

export const signOut = user => {
  return axios(buildSignOutOptions(apiUrl, user))
}

export const changePassword = (passwords, user) => {
  return axios(buildChangePasswordOptions(apiUrl, passwords, user))
}
