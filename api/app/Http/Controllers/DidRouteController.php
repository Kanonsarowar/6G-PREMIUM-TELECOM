<?php

namespace App\Http\Controllers;

use App\Models\DidRoute;
use Illuminate\Http\Request;

class DidRouteController extends Controller
{
    public function index()
    {
        return view('admin.dids.index', [
            'dids' => DidRoute::all()
        ]);
    }

    public function create()
    {
        return view('admin.dids.create');
    }

    public function store(Request $request)
    {
        $request->validate([
            'did_number' => 'required',
            'destination' => 'required',
            'status' => 'required'
        ]);

        DidRoute::create($request->all());

        return redirect('/admin/dids');
    }

    public function edit($id)
    {
        $did = DidRoute::findOrFail($id);
        return view('admin.dids.edit', compact('did'));
    }

    public function update(Request $request, $id)
    {
        $request->validate([
            'did_number' => 'required',
            'destination' => 'required',
            'status' => 'required'
        ]);

        $did = DidRoute::findOrFail($id);
        $did->update($request->all());

        return redirect('/admin/dids');
    }

    public function destroy($id)
    {
        $did = DidRoute::findOrFail($id);
        $did->delete();

        return redirect('/admin/dids');
    }
}
