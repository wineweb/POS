# -*- coding: utf-8 -*-
import logging
import psycopg2
import json
import requests
from odoo.exceptions import ValidationError, UserError
from odoo import api, fields, models, registry, SUPERUSER_ID, _


class ResUsers(models.Model):
    _inherit = 'res.users'

    gera_user_id = fields.Char('Gera User ID')
    gera_user_password = fields.Char('Gera User Password')