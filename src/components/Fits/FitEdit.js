// imports
import React, { Component, Fragment } from 'react'
import { Redirect, withRouter } from 'react-router-dom'
import axios from 'axios'
import apiUrl from '../../apiConfig'
import Button from 'react-bootstrap/Button'

// class
class UpdateFit extends Component {
  constructor (props) {
    super(props)

    this.state = {
      fit: {
        name: '',
        brand: '',
        site: '',
        photo: ''
      },
      updated: false
    }
  }

  async componentDidMount () {
    // we're going to "try" some things (our request)
    try {
      const res = await axios(`${apiUrl}/fits/${this.props.match.params.id}`)
      this.setState({ fit: res.data.fit })
    } catch (err) {
      // if anything goes wrong in the try block, hanlde error
      console.error(err)
    }
  }

  handleSubmit = (event) => {
    event.preventDefault()
    const { user, match } = this.props
    axios({
      method: 'PATCH',
      url: `${apiUrl}/fits/${match.params.id}`,
      headers: {
        'Authorization': `Bearer ${user.token}`
      },
      data: { fit: this.state.fit }
    })
      .then(() => this.setState({ updated: true }))
      .catch(console.error)
  }

  handleInputChange = (event) => {
    event.persist()
    // merge/combine the updatedField & the current state.book
    this.setState(currState => {
      const updatedField = {
        [event.target.name]: event.target.value
      }
      // spread operator (...) will turn an object/array into coma
      // separate values or key/value pairs
      // { ...{ title: '', author: '' }, ...{ title: 'a' } }
      // { title: '', author: '', title: 'a' }
      // {author: '', title: 'a' }
      const newFit = { ...currState.fit, ...updatedField }

      // Object.assign copies key/values pairs from one or more objects to a target object
      // Empty object is the 1st arg (modified in place)
      // state is the 2nd arg
      // updatedField is the 3rd arg (comes after the state so it overrides the state values)
      // const newBook = Object.assign({}, this.state.book, updatedField)

      return { fit: newFit }
    })
  }

  render () {
    // let fitJsx
    // const { msgAlert, user } = this.props
    const { fit, updated } = this.state
    if (!fit) {
      return (
        <div>
          <h2>GO MAKE A FIT!</h2>
        </div>
      )
    }
    if (updated) {
      return <Redirect to={'/fits'} />
    }
    return (
      <main className='updatePage mx-auto'>
        <Fragment>
          <form onSubmit={this.handleSubmit} className='fitsDiv2 mx-auto'>
            <h2 className='updateForm'>Update a fit</h2>
            <input
              name="name"
              type="text"
              placeholder="NAME"
              value={this.state.fit.name}
              onChange={this.handleInputChange}
            />
            <input
              name="brand"
              type="text"
              placeholder="TYPE"
              value={this.state.fit.brand}
              onChange={this.handleInputChange}
            />
            <input
              name="site"
              type="text"
              placeholder="website"
              value={this.state.fit.site}
              onChange={this.handleInputChange}
            />
            <label>PHOTO</label>
            <input
              placeholder='ENTER IMAGE URL'
              type='text'
              name='photo'
              value={this.state.fit.photo}
              onChange={this.handleInputChange}
            />
            <Button
              type="submit"
              variant="primary"
            >
              Submit
            </Button>
          </form>
        </Fragment>
      </main>
    )
  }
}

// export
export default withRouter(UpdateFit)
