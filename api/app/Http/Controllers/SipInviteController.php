<?php

namespace App\Http\Controllers;

use App\Models\SipInvite;

class SipInviteController extends Controller
{
    public function index()
    {
        return view('admin.sipinvites.index', [
            'invites' => SipInvite::orderBy('id', 'DESC')->get()
        ]);
    }
}
