import React, { Fragment } from 'react'
import Nav from 'react-bootstrap/Nav'
import Navbar from 'react-bootstrap/Navbar'
import '../ALL.scss'

const authenticatedOptions = (
  <Fragment>
    <Nav.Link href="#change-password">CHANGE PASS</Nav.Link>
    <Nav.Link href="#sign-out">$IGN OUT</Nav.Link>
    <Nav.Link href="fit-create">CRE@TE FIT</Nav.Link>
    <Nav.Link href="#my-fits">MY FITS</Nav.Link>
  </Fragment>
)

const unauthenticatedOptions = (
  <Fragment>
    <Nav.Link href="#sign-up">SIGN UP</Nav.Link>
    <Nav.Link href="#sign-in">SIGN IN</Nav.Link>
  </Fragment>
)

const alwaysOptions = (
  <Fragment>
    <Nav.Link href="#/">HOME</Nav.Link>
  </Fragment>
)

const Header = ({ user }) => (
  <Navbar className='navbar'>
    <Navbar.Brand href="#">
      FITCHECK
    </Navbar.Brand>
    <Navbar.Toggle aria-controls="basic-navbar-nav" />
    <Navbar.Collapse id="basic-navbar-nav">
      <Nav className="ml-auto">
        { user && <span className="navbar-text mr-2">Welcome, {user.email}</span>}
        { alwaysOptions }
        { user ? authenticatedOptions : unauthenticatedOptions }
      </Nav>
    </Navbar.Collapse>
  </Navbar>
)

export default Header
