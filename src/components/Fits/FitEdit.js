// imports
import React, { Component, Fragment } from 'react'
import { Redirect, withRouter } from 'react-router-dom'

// import axios & apiConfig
import axios from 'axios'
import apiUrl from '../../apiConfig'

// class
class UpdateFit extends Component {
  constructor (props) {
    super(props)

    this.state = {
      fit: {
        name: '',
        brand: '',
        site: ''
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
      method: 'patch',
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

      return { ft: newFit }
    })
  }

  render () {
    if (this.state.updated) {
      return <Redirect to={`{/fits/${this.props.match.params.id}}`}/>
    }
    return (
      <main className='updatePage'>
        <Fragment>
          <h2 className='updateForm'>Update an fit</h2>
          <form onSubmit={this.handleSubmit} className='fitsDiv2'>
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
              placeholder="fit skill here"
              value={this.state.fit.site}
              onChange={this.handleInputChange}
            />
            <button type="submit" className='submitBtn'>Submit</button>
          </form>
        </Fragment>
      </main>
    )
  }
}

// export
export default withRouter(UpdateFit)
